/*/api/_lib/jwt.server.js*/
import { signJWT } from "../../src/shared/jwt.js";  // 상대경로로 수정

export function verifyJWT(token, secret) {
  return new Promise((resolve, reject) => {
    verifyJWTFromEdge(token, secret)
      .then((decoded) => resolve(decoded))
      .catch((err) => reject(err));
  });
}
