import sys, platform
print('sys.executable =', sys.executable)
print('platform.python_version() =', platform.python_version())
print('sys.version =', sys.version.splitlines()[0])

# try importing a common package to show whether packages are installed
try:
    import requests
    print('requests:', requests.__version__)
except Exception as e:
    print('requests import failed:', type(e).__name__, str(e))

# show a short stdout marker so parsing is easy
print('SMOKE_TEST_COMPLETE')
