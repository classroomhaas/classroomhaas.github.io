import sys
from cx_Freeze import setup, Executable

# Dependencies are automatically detected, but it might need fine tuning.
build_exe_options = {"packages": ["os"], "include_files" : ["assets", "assets"]}

# GUI applications require a different base on Windows (the default is for
# a console application).
base = None
if sys.platform == "win32":
    base = "Win32GUI"

setup(
    name = "gun-mayhem",
    version = "0.1",
    description = "Gun Mayhem!",
    options = {"build_exe": build_exe_options},
    executables = [Executable("main.py", base=base, icon="assets/icon/icon.png")]
)
