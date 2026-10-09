import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User';
import env from './env';
import { validSession } from '../utils/sessions';
import { GoogleStateStore } from '../account/googleState';
import type {StateStore} from 'passport-oauth2';

// Configuración de la estrategia JWT
const jwtOptions: StrategyOptionsWithoutRequest = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: env.jwtSecret,
  algorithms: ['HS256'],
};

// Estrategia JWT
passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      if (!Number.isSafeInteger(payload.id) || payload.id <= 0 || !Number.isFinite(payload.exp)) return done(null, false);
      // Buscar usuario por ID
      const user = await User.findByPk(payload.id);
      
      if (!user) {
        return done(null, false);
      }
      
      // Verificar si el usuario está activo
      if (!validSession(payload.jti, user)) {
        return done(null, false);
      }
      
      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  })
);

// Estrategia de Google OAuth
if (env.google.clientId && env.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.google.clientId,
        clientSecret: env.google.clientSecret,
        callbackURL: env.google.callbackUrl,
        scope: ['profile', 'email'],
        // Passport chooses one supported signature by function arity; its types
        // incorrectly require both overloads and disallow null on verify success.
        store: new GoogleStateStore(env.google.callbackUrl.startsWith('https://')) as unknown as StateStore,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Buscar usuario por ID de Google
          let user = await User.findOne({ where: { google_id: profile.id } });
          
          // A matching email is not authorization to link an existing identity.
          // Existing users must sign in with their original method.
          if (!user) {
            const email = profile.emails?.find(item => item.verified === true)?.value;
            if (!email || !profile.id) return done(null, false);
            if (await User.findOne({where:{email}})) return done(null, false, {message:'identity-conflict'});
            user = await User.create({
              email,
              nombre: profile.displayName || profile.name?.givenName || 'Usuario de Google',
              google_id: profile.id,
              rol: 'usuario',
              activo: true,
            });
          }
          
          if (!user.activo) return done(null, false);
          // Actualizar última conexión
          user.ultima_conexion = new Date();
          await user.save();
          
          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
}

// Serialización y deserialización del usuario para sesiones (si se usan)
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
