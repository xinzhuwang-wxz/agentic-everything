import unittest
from respond import digest, validate


class ProtocolChecks(unittest.TestCase):
    def test_hash_is_key_order_independent(self):
        self.assertEqual(digest({'b': 2, 'a': {'z': 1, 'c': 2}}),
                         digest({'a': {'c': 2, 'z': 1}, 'b': 2}))

    def test_extra_argument_rejected(self):
        with self.assertRaises(AssertionError):
            validate({'id': 'x', 'authority': True}, {'type': 'object', 'properties': {'id': {'type': 'string'}}, 'additionalProperties': False})

    def test_missing_argument_rejected(self):
        with self.assertRaises(AssertionError):
            validate({}, {'type': 'object', 'required': ['id']})

    def test_invalid_enum_rejected(self):
        with self.assertRaises(AssertionError):
            validate('urgent', {'type': 'string', 'enum': ['low', 'high']})

    def test_version_bounds_and_boolean_rejected(self):
        schema = {'type': 'integer', 'exclusiveMinimum': 0, 'maximum': 9007199254740991}
        for value in [True, 0, -1, 9007199254740992]:
            with self.assertRaises(AssertionError):
                validate(value, schema)
        validate(1, schema)


if __name__ == '__main__':
    unittest.main()
