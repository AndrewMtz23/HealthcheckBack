import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scheduler_control import scheduler_enabled


class SchedulerControlTests(unittest.TestCase):
    def test_scheduler_is_opt_in_and_diagnostic_mode_always_disables_it(self):
        self.assertFalse(scheduler_enabled({}))
        self.assertFalse(scheduler_enabled({'ML_SCHEDULER_ENABLED': 'false'}))
        self.assertTrue(scheduler_enabled({'ML_SCHEDULER_ENABLED': 'true'}))
        self.assertFalse(scheduler_enabled({
            'HEALTHCHECK_DIAGNOSTIC': '1',
            'ML_SCHEDULER_ENABLED': 'true',
        }))


if __name__ == '__main__':
    unittest.main()
