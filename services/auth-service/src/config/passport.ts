import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User';
import env from './env';

// Configuración de la estrategia JWT
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: env.jwtSecret,
};

// Estrategia JWT
passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      // Buscar usuario por ID
      const user = await User.findByPk(payload.id);
      
      if (!user) {
        return done(null, false);
      }
      
      // Verificar si el usuario está activo
      if (!user.activo) {
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
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Buscar usuario por ID de Google
          let user = await User.findOne({ where: { google_id: profile.id } });
          
          // Si no existe por google_id, verificar si existe por email
          if (!user && profile.emails && profile.emails.length > 0) {
            const email = profile.emails[0].value;
            user = await User.findOne({ where: { email } });
            
            if (user) {
              // Si el usuario existe pero no tiene google_id, actualizar
              user.google_id = profile.id;
              await user.save();
            }
          }
          
          // Si aún no existe, crear nuevo usuario
          if (!user) {
            user = await User.create({
              email: profile.emails?.[0].value || '',
              nombre: profile.displayName || profile.name?.givenName || 'Usuario de Google',
              google_id: profile.id,
              rol: 'usuario',
              activo: true,
            });
          }
          
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