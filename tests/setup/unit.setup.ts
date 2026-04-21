// Runs before every backend-unit test. Freeze randomness so repeated
// runs produce the same data; this makes flake diagnosable rather than
// mysterious.
import { faker } from '@faker-js/faker';
faker.seed(1234);
