"""Launch Azure."""
import traceback, sys, os
from pathlib import Path

# Add current directory to sys.path so we can import bot.py
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Change CWD to Azure9 so relative paths in config/logs work correctly
os.chdir(_ROOT)

try:
    from bot import BotRunner
    BotRunner("config_azure.yaml").run()
except Exception as e:
    print("\n=== CRASH ===")
    traceback.print_exc()
    print("\nPress Enter to close...")
    input()
    sys.exit(1)
