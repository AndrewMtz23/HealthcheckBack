import os
import unittest
from unittest.mock import Mock, patch
from flask import Flask, g
from utils.audit import make_event, write_audit, audited_job


class AuditTests(unittest.TestCase):
    def test_contract_and_no_identity_from_unverified_headers(self):
        app = Flask(__name__)
        with app.test_request_context(headers={'X-User-Id':'999','X-Forwarded-For':'8.8.8.8'}):
            event = make_event('ANALYSIS_RUN', 'started')
            self.assertIsNone(event['user_id'])
            self.assertNotEqual(event['ip_address'], '8.8.8.8')
            g.user_id, g.user_role = 2, 'usuario'
            self.assertEqual(make_event('ANALYSIS_RUN', 'success')['user_id'], 2)

    def test_started_and_terminal_share_context_and_failure_is_not_success(self):
        app = Flask(__name__)
        with app.test_request_context(), patch.dict(os.environ, {'AUDIT_ENABLED':'true'}), patch('utils.audit.write_audit') as writer, patch('utils.audit.db.session'):
            @audited_job('ANALYSIS_RUN')
            def run():
                return {'error':'Synthetic'}, 400
            run()
            events = [call.args[0] for call in writer.call_args_list]
            self.assertEqual([e['outcome'] for e in events], ['started','failure'])
            self.assertEqual(events[0]['request_id'], events[1]['request_id'])
            self.assertNotEqual(events[0]['event_key'], events[1]['event_key'])

    def test_writer_uses_callers_transaction_and_rejects_secret_metadata(self):
        session = Mock()
        with patch.dict(os.environ, {'AUDIT_ENABLED':'true'}):
            write_audit(make_event('ANALYSIS_RUN','success'),session)
            session.commit.assert_not_called()
            with self.assertRaises(ValueError):
                write_audit(make_event('ANALYSIS_RUN','success',metadata={'token':'secret'}),session)

if __name__ == '__main__':
    unittest.main()
