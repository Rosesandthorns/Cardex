import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { app, renumberDuplicateCards } from "./src/server/app";


async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start the hourly duplicate renumbering check
    // 3600000 ms = 1 hour
    setInterval(() => {
      renumberDuplicateCards().catch(err => {
        console.error("[Vantage] Critical error in hourly renumbering interval:", err);
      });
    }, 3600000);
    
    // Run once on startup as well
    renumberDuplicateCards().catch(err => {
      console.error("[Vantage] Critical error in initial renumbering check:", err);
    });
  });

}

startServer();
