"""pytest path setup — permite correr `pytest` a partir de `python/`."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
