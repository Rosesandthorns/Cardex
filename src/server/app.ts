import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  } catch (e) {
    console.error("Failed to initialize Firebase Admin:", e);
  }
}

const app = express();

// Configure CORS
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-ai-api-key", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  if (req.url.startsWith("/api")) {
    console.log(`[API Request] ${req.method} ${req.url}`);
  }
  next();
});

// Middleware to ensure AI API routes return JSON
app.use("/api", (req, res, next) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI API Routes
const checkAiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers["x-ai-api-key"];
  if (!apiKey || apiKey !== process.env.AI_API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
  }
  next();
};

app.get("/api/ai/state", checkAiKey, async (req, res) => {
  const db = admin.apps.length > 0 ? admin.firestore() : null;
  if (!db) return res.status(500).json({ error: "Firebase Admin not initialized" });
  
  const aiUid = process.env.AI_USER_UID;
  if (!aiUid) return res.status(400).json({ error: "AI_USER_UID not configured" });

  try {
    const userDoc = await db.collection("users").doc(aiUid).get();
    const userData = userDoc.data();

    const cardsSnapshot = await db.collection("user_cards").where("ownerUid", "==", aiUid).get();
    const inventory = cardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const marketSnapshot = await db.collection("market_listings").where("active", "==", true).get();
    const market = marketSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const tradesSnapshot = await db.collection("trades").where("receiverUid", "==", aiUid).where("status", "==", "pending").get();
    const trades = tradesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({
      profile: userData,
      inventory,
      market,
      trades,
      aiUid
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ai/action", checkAiKey, async (req, res) => {
  const db = admin.apps.length > 0 ? admin.firestore() : null;
  if (!db) return res.status(500).json({ error: "Firebase Admin not initialized" });
  
  const aiUid = process.env.AI_USER_UID;
  if (!aiUid) return res.status(400).json({ error: "AI_USER_UID not configured" });

  const { action, payload } = req.body;

  try {
    switch (action) {
      case "LIST_CARD": {
        const { userCardId, price } = payload;
        const listingRef = db.collection("market_listings").doc();
        await listingRef.set({
          sellerUid: aiUid,
          userCardId,
          price,
          active: true,
          createdAt: new Date().toISOString()
        });
        return res.json({ success: true, listingId: listingRef.id });
      }

      case "BUY_CARD": {
        const { listingId } = payload;
        const listingRef = db.collection("market_listings").doc(listingId);
        const listing = await listingRef.get();
        if (!listing.exists || !listing.data()?.active) throw new Error("Listing not found or inactive");

        const data = listing.data()!;
        const userRef = db.collection("users").doc(aiUid);
        const user = await userRef.get();
        if (!user.exists || (user.data()?.chips || 0) < data.price) throw new Error("Insufficient chips");

        await db.runTransaction(async (t) => {
          t.update(userRef, { chips: admin.firestore.FieldValue.increment(-data.price) });
          t.update(listingRef, { active: false });
          t.update(db.collection("user_cards").doc(data.userCardId), { ownerUid: aiUid });
        });
        return res.json({ success: true });
      }

      case "ACCEPT_TRADE": {
        const { tradeId } = payload;
        const tradeRef = db.collection("trades").doc(tradeId);
        const trade = await tradeRef.get();
        if (!trade.exists || trade.data()?.status !== "pending") throw new Error("Trade not found or not pending");

        const data = trade.data()!;
        await db.runTransaction(async (t) => {
          t.update(tradeRef, { status: "accepted", updatedAt: new Date().toISOString() });
          data.senderCardIds.forEach((id: string) => t.update(db.collection("user_cards").doc(id), { ownerUid: aiUid }));
          data.receiverCardIds.forEach((id: string) => t.update(db.collection("user_cards").doc(id), { ownerUid: data.senderUid }));
        });
        return res.json({ success: true });
      }

      case "INITIATE_TRADE": {
        const { receiverUid, senderCardIds, receiverCardIds } = payload;
        const tradeRef = db.collection("trades").doc();
        await tradeRef.set({
          senderUid: aiUid,
          receiverUid,
          senderCardIds,
          receiverCardIds,
          status: "pending",
          createdAt: new Date().toISOString()
        });
        return res.json({ success: true, tradeId: tradeRef.id });
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const renumberDuplicateCards = async () => {
  const db = admin.apps.length > 0 ? admin.firestore() : null;
  if (!db) {
    console.error("[Vantage] Renumbering failed: Firebase Admin not initialized");
    return;
  }

  console.log("[Vantage] Starting hourly duplicate renumbering check...");

  try {
    const cardsSnapshot = await db.collection("user_cards").get();
    const allUserCards = cardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    // Group by cardId and printNumber
    const groups: { [key: string]: any[] } = {};
    allUserCards.forEach(uc => {
      const key = `${uc.cardId}_${uc.printNumber}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(uc);
    });

    let renumberedCount = 0;

    for (const key in groups) {
      const group = groups[key];
      if (group.length > 1) {
        // Sort by acquiredAt: oldest first (ascending)
        // The one printed MOST RECENTLY (latest acquiredAt) should be renumbered.
        group.sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime());

        const oldest = group[0]; // Oldest stays
        const toRenumber = group.slice(1); // More recent ones get new numbers

        console.log(`[Vantage] Found ${group.length} duplicates for ${key}. Renumbering ${toRenumber.length} recent cards.`);

        for (const uc of toRenumber) {
          // Find next available number for this cardId
          const cardId = uc.cardId;
          const sameCardSnapshot = await db.collection("user_cards").where("cardId", "==", cardId).get();
          const existingNumbers = sameCardSnapshot.docs.map(doc => (doc.data() as any).printNumber || 0);
          const nextNumber = Math.max(...existingNumbers, 0) + 1;

          await db.collection("user_cards").doc(uc.id).update({
            printNumber: nextNumber,
            renumberedAt: new Date().toISOString(),
            originalPrintNumber: uc.printNumber,
            renumberReason: "duplicate_check"
          });
          
          renumberedCount++;
          console.log(`[Vantage] Card ${uc.id} (${uc.cardId}) renumbered from ${uc.printNumber} to ${nextNumber}`);
        }
      }
    }
    console.log(`[Vantage] Duplicate renumbering check completed. Total renumbered: ${renumberedCount}`);
  } catch (error) {
    console.error("[Vantage] Error during duplicate renumbering:", error);
  }
};

export { app };

