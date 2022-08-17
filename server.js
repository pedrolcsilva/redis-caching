const express = require('express');
const { format } = require('path');
const cors = require('cors')
const app = express();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

app.use(cookieParser());

const encryptor = {
  hashPwd: ( password ) => {
    const saltRounds = 10;
    return bcrypt.hashSync(password, saltRounds);
  },
  comparePwd: ( password, hash ) => {
    return bcrypt.compareSync(password, hash);
  }
};

const VERIFY_TOKEN = (req, res, next) => {
    try {
        console.log(JSON.stringify(req.cookies))
        const { Token } = req.cookies;
        if( !Token ){
            console.error({ auth: false, errorMessage: 'Token invalid.' });

            return res.json({ auth: false, errorMessage: 'Token invalid.' }).status(401);
        } else {
            jwt.verify( Token, process.env.TOKEN, (error, username) => {
                if( error ){
                    console.error({ auth: false, errorMessage: 'Token authentication failed.' });

                    return res.status(500).json({ auth: false, errorMessage: 'Token authentication failed.', error });
                } else {
                    req.username = username;
                    console.log({ successMessage: `Trying to authenticate: ${username} was a success!` });

                    return next();
                };
            }
            );
        };
    } catch (error) {
        console.error({ errorMessage: 'Trying to authenticate', error });

        return res.status(400).json({ errorMessage: 'Trying to authenticate', error });
    };
}
  
const Redis = require('ioredis'),
redis = Redis.createClient({
    port: 6380,
    host: "127.0.0.1"
});
const { RateLimiterRedis } = require('rate-limiter-flexible');
const rateLimiterRedis = new RateLimiterRedis({
    redis: redis,
    points: 5,
    duration: 15 * 60,
    blockDuration: 15 * 60,
})

const Pool = require('pg').Pool,
 pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'redis-caching',
    password: 'LndpLndpLndp123',
    port: 5432,
});

require('dotenv').config()

app.use(cors({
    origin : "http://localhost:8000",
    credentials: true,
  }))  

app.set('trust proxy', 1);

const cacheHandle = function (key, getUserData) {
    return new Promise( (resolve, reject) => {
        redis.get( key, async (error, data) => {
            if( error ) {
                console.error(error);

                return reject(error);
            };

            if( data != null ) {
                console.log({ successMessage: "Redis Hit!" });
                
                return resolve(JSON.parse(data));
            };

            console.log({ successMessage: "Redis Miss!" });
            const USER_DATA = await getUserData();
            redis.setex( key, 60, JSON.stringify(USER_DATA) );

            return resolve(USER_DATA);
        });
    });
}

    
app.get('/', VERIFY_TOKEN, jsonParser, async (req, res) => {
    try {
        const { username } = req;
        const data = await cacheHandle(`${username}`, async () => {
          return await pool.query('SELECT username FROM users WHERE username = $1', [username]);
        });

        console.log({ successMessage: `Getting ${username} login was a success!` });

        

        return res.status(200).json(data.rows[0].username);
    } catch (error) {
        console.error({ errorMessage: 'Getting user login got a error!', error });
    
        return res.status(400).json({ errorMessage: 'Getting user login got a error!', error });  
    }
    
})

app.post('/login', jsonParser, async (req, res) => {
    try {
        rateLimiterRedis.consume(req.socket.remoteAddress)
          .then( async (connectionData) => {
            
            const { username, password } = req.body;
            console.log(process.env.PASSWORD)
            const postgresData =  await pool.query('SELECT password FROM users WHERE username = $1', [username]);
    
            console.log(username, password)
            if( !postgresData.rows[0] || !encryptor.comparePwd(password, postgresData.rows[0].password)) {
              console.error({ errorMessage: `Login Failed. Host: ${req.socket.remoteAddress}`, attempts_left: connectionData.remainingPoints});
    
              return res.status(400).json({ errorMessage: 'Login Failed', attempts_left: connectionData.remainingPoints});
            } else {

              const TOKEN = jwt.sign(username, process.env.TOKEN);
              console.log({ successMessage: `${username} login was successful` });
    
              return res.cookie('Token', TOKEN, { maxAge:  2 * 60 * 60 * 1000, httpOnly: false }).json({ successMessage: 'Login success!' }).status(200);
            };
          }).catch( (rejectResponse) => {
            
            const secBeforeNextTry = Math.ceil(rejectResponse.msBeforeNext / 1000) || 1;
            res.set('Retry-After', JSON.stringify(secBeforeNextTry));
            console.error({ errorMessage: `Too many requests from: ${req.socket.remoteAddress}`, rejectResponse });
    
            return res.status(429).json({ errorMessage: `Too many requests from: ${req.socket.remoteAddress}`, rejectResponse  });
          });
      } catch (error) {
        console.error({ errorMessage: 'Login error!', error });
    
        return res.status(400).json({ errorMessage: 'Login error!', error });
      }
    
})

app.get('/logout', (req, res) => {
    res.clearCookie("Token");
    req.username = null;
	res.json('Cookie has been deleted')
})

app.listen(8080, (req, res) => {
    console.log('Listenning to port 8080')
})
