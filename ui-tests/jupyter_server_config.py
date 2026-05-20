import os
import json
from pathlib import Path

# Disable news popup automatically by creating the required settings file
settings_dir = Path(__file__).parent / '.jupyter_test' / 'settings' / '@jupyterlab' / 'apputils-extension'
settings_dir.mkdir(parents=True, exist_ok=True)
(settings_dir / 'notification.jupyterlab-settings').write_text(json.dumps({
    "fetchNews": "false"
}))

c = get_config()  # type:ignore

c.ServerApp.tornado_settings = {
    "page_config_data": {
        "plainTextNotebookConfig": '{"rules": [{"dir": "percent", "parser": "parsePy"}, {"dir": "sphinx_gallery", "parser": "parseSphinxGallery"}, {"dir": "markdown", "parser": "parseClassicMd"}, {"dir": "myst", "parser": "parseMystMd"}]}'
    }
}
