import express from 'express';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const router = express.Router();
const prisma = new PrismaClient();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        password: true,
        role: true
      }
    });

    if (user && await bcrypt.compare(password, user.password)) {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const token = await new SignJWT({ email: user.email, role: user.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('60m')
        .sign(secret);

      res.cookie('jwt_token', token, { httpOnly: true, maxAge: 60*60*1000 });
      res.send({ success: true, message: 'Logged in successfully', role: user.role });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/verify-token', (req, res) => {
    const cookie = req.cookies['jwt_token'];
    
    try {
      const verified = jwt.verify(cookie, process.env.JWT_SECRET);
      if (!verified) {
        return res.status(401).send({ success: false, message: 'Unauthenticated' });
      }
  
      res.send({ success: true, role: verified.role });
    } catch (err) {
      console.error(err);
      res.status(401).send({ success: false, message: 'Unauthenticated' });
    }
  });
  

router.post('/logout', (req, res) => {
    res.cookie('jwt_token', '', { maxAge: 0 });
    res.send({ success: true, message: 'Logged out successfully' });
})

export default router;