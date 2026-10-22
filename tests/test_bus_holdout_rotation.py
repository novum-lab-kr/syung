import unittest
from server.jobs.bus_samples import day_routes

class BusHoldoutRotationTest(unittest.TestCase):
    def test_budget_repeat_and_full_rotation(self):
        for size in (2, 7, 31):
            ids = [str(i) for i in range(size)]
            for slots in (2, 3, 8):
                seen = set()
                for day in range(2 * size):
                    now = day_routes(ids, day, slots * 900)
                    before = day_routes(ids, day - 1, slots * 900)
                    self.assertEqual(len(now), min(size, slots))
                    self.assertEqual(len(set(now)), len(now))
                    self.assertTrue(set(now) & set(before))
                    self.assertEqual(now, day_routes(reversed(ids), day, slots * 900))
                    seen.update(now)
                self.assertEqual(seen, set(ids))

    def test_one_slot_pairs_days(self):
        ids = ['a', 'b', 'c']
        for day in range(0, 6, 2):
            self.assertEqual(day_routes(ids, day, 700), day_routes(ids, day + 1, 700))
        self.assertEqual(len({day_routes(ids, day, 700)[0] for day in range(6)}), 3)
        self.assertEqual(day_routes([], 1, 700), [])

if __name__ == '__main__':
    unittest.main()
