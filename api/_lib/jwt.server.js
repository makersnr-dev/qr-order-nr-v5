// /api/_lib/jwt.server.js
import { signJWT, verifyJWT } from "../../src/shared/jwt.js";  // 상대경로로 수정

export function verifyJWTFromServer(token, secret) {
  return new Promise((resolve, reject) => {
    verifyJWT(token, secret)  // /src/shared/jwt.js의 verifyJWT 사용
      .then((decoded) => resolve(decoded))
      .catch((err) => reject(err));
  });
}
