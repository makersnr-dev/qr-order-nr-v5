// /api/_lib/jwt.server.js
import { signJWT, verifyJWT } from "../../src/shared/jwt.js";  // 상대경로로 수정

// JWT 검증
export function verifyJWTFromServer(token, secret) {
  return new Promise((resolve, reject) => {
    verifyJWT(token, secret)  // /src/shared/jwt.js에서 verifyJWT 사용
      .then((decoded) => resolve(decoded))
      .catch((err) => reject(err));
  });
}

// signJWT를 다른 곳에서 사용할 수 있도록 export
export { signJWT };
