// Kamil Postaağası, 2023501030
import { z } from "zod";

/** Register and login share one body: a valid email and a password of 8+ characters. */
export const Credentials = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, "password must have at least 8 characters").max(72),
});
