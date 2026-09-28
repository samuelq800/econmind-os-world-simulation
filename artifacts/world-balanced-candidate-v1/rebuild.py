"""Rebuild only this isolated candidate package from frozen inputs."""
from pathlib import Path
import subprocess,sys,os
base=Path(__file__).parent
for script in ['build.py','route.py','complete.py','check.py']:
 subprocess.run([sys.executable,str(base/script)],check=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
