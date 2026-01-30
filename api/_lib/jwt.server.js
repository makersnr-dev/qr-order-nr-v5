// /api/_lib/jwt.server.js
import { signJWT, verifyJWT } from "../../src/shared/jwt.js";  // 상대경로로 수정

export function verifyJWT(token, secret) {
  return new Promise((resolve, reject) => {
    verifyJWT(token, secret)  // 수정된 부분: verifyJWT로 변경
      .then((decoded) => resolve(decoded))
      .catch((err) => reject(err));
  });
}
