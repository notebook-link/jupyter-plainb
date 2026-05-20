c = get_config()  # type:ignore

c.ServerApp.tornado_settings = {
    "page_config_data": {
        "plainTextNotebookConfig": '{"rules": [{"dir": "percent", "parser": "parsePy"}, {"dir": "sphinx_gallery", "parser": "parseSphinxGallery"}, {"dir": "markdown", "parser": "parseClassicMd"}, {"dir": "myst", "parser": "parseMystMd"}]}'
    }
}
