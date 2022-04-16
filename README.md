# waku-waku-video-meeting
Video chat with 2D avatar

Currently, under development.


## Build (local)

```
cd auth
docker build -t waku-waku-auth .
cd ../client
docker build -t waku-waku-client .
cd ../db
docker build -t waku-waku-db .
cd ../sfu
docker build -t waku-waku-sfu .

cd ../
docker-compose up -d
```