import { verifyJWT as verifyJWTFromEdge } from "/src/shared/jwt.js";

export function verifyJWT(token, secret) {
  return new Promise((resolve, reject) => {
    verifyJWTFromEdge(token, secret)
      .then((decoded) => resolve(decoded))
      .catch((err) => reject(err));
  });
}
