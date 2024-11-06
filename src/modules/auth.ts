import { SignJWT } from 'jose'
import { env } from '../env'

export async function authenticateUser(userId: string) {
  const secret = new TextEncoder().encode(env.JWT_SECRET)

  const token = await new SignJWT()
    .setSubject(userId)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1d')
    .setIssuedAt()
    .sign(secret)

  return token
}
