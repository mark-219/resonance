import { vi } from 'vitest';
import bcrypt from 'bcrypt';

// Speed up bcrypt hashing in tests (1 round instead of 10)
const originalHash = bcrypt.hash.bind(bcrypt);
vi.spyOn(bcrypt, 'hash').mockImplementation(
  (data: string | Buffer, saltOrRounds: string | number) => {
    return originalHash(data, 1);
  }
);
