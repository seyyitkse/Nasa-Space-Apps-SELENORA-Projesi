"""Import-time provenance: a later checkout/commit cannot relabel an old server."""
import hashlib
import os
import subprocess
from pathlib import Path
from app import __version__

ROOT = Path(__file__).resolve().parents[3]


def _git(*args):
    try:
        return subprocess.check_output(['git', '-C', str(ROOT), *args], timeout=3, text=True).strip()
    except (OSError, subprocess.SubprocessError):
        return 'unknown'


def _digest():
    digest = hashlib.sha256()
    for path in sorted((ROOT / 'backend/app').rglob('*.py')):
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


PROVENANCE = dict(phase='5F.2', package_version=__version__, pid=os.getpid(), worktree=str(ROOT),
                  commit=_git('rev-parse', 'HEAD'), branch=_git('branch', '--show-current'),
                  source_dirty=bool(_git('status', '--porcelain', '--', 'backend/app')),
                  backend_source_sha256=_digest(), tile_grid='sps-768km-v1')
