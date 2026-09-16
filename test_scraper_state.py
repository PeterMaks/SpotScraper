"""Isolated state-helper tests: do not import downloader or touch personal data."""
import ast
import json
import os
import tempfile
import unittest
from pathlib import Path


class StateTests(unittest.TestCase):
    def test_state_directory_and_atomic_cache(self):
        tree = ast.parse(Path(__file__).with_name('Scraper.py').read_text(encoding='utf-8'))
        # Execute only state configuration and cache helpers, not downloader startup.
        nodes = [node for node in tree.body if
                 isinstance(node, ast.FunctionDef) and node.name in ('save_cache', 'load_cache') or
                 isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('DATA_DIR', 'CACHE_FILE') for t in node.targets)]
        with tempfile.TemporaryDirectory() as directory:
            old = os.environ.get('DATA_DIR')
            os.environ['DATA_DIR'] = directory
            try:
                scope = {'os': os, 'json': json, 'tempfile': tempfile, '__file__': str(Path(__file__).with_name('Scraper.py'))}
                exec(compile(ast.Module(body=nodes, type_ignores=[]), '<state helpers>', 'exec'), scope)
                self.assertEqual(Path(scope['CACHE_FILE']).parent, Path(directory))
                scope['save_cache']({'example': {'status': 'ok'}})
                self.assertEqual(scope['load_cache'](), {'example': {'status': 'ok'}})
                self.assertEqual(sorted(os.listdir(directory)), ['download_cache.json'])
            finally:
                if old is None:
                    os.environ.pop('DATA_DIR', None)
                else:
                    os.environ['DATA_DIR'] = old


if __name__ == '__main__':
    unittest.main()
