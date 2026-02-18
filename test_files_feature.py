
import unittest
from flask import session
from server import app
from db import init_db

class TestFilesAPI(unittest.TestCase):
    def setUp(self):
        app.testing = True
        app.secret_key = 'test_secret'
        self.client = app.test_client()
        # Ensure DB is initialized (table exists)
        # init_db() # careful not to reset prod db if it drops tables. 
        # db.py init_db usually creates if not exists.
        
    def login(self):
        with self.client.session_transaction() as sess:
            sess['authenticated'] = True
            sess['sid'] = 'test-session'

    def test_list_files_unauthorized(self):
        response = self.client.get('/api/files')
        self.assertEqual(response.status_code, 302) # Redirects to login

    def test_list_files_authorized(self):
        self.login()
        response = self.client.get('/api/files')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(isinstance(response.json, list))
        print(f"Files found: {len(response.json)}")

if __name__ == '__main__':
    unittest.main()
