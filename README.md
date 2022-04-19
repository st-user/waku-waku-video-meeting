# waku-waku-video-meeting
Video chat with 2D avatar

Currently, under development.

## How to run

### Build and run for development

``` bash

git clone ...

cp auth/sample.env auth/.env
cp sfu/sample.env sfu/.env
# Edit the two '.env' files according to your environment.

```

``` bash
# on the project's root directory...
cd db
docker build -t waku-waku-db .
docker run --rm -it -d -p 5555:5432 --name waku-waku-db waku-waku-db
```

Open another terminal and:

``` bash
# on the project's root directory...
cd auth
cargo run
```

Open another terminal and:

``` bash
# on the project's root directory...
cd sfu
cargo run
```

Open another terminal and:
``` bash
# on the project's root directory...
cd client
npm run start


```

### Build and run with docker in local.

``` bash

git clone ...
cp auth/sample.env auth/.env
cp sfu/sample.env sfu/.env
# Edit the two '.env' files according to your environment.


# on the project's root directory...
cd auth
docker build -t waku-waku-auth .
cd ../client
docker build -t waku-waku-client -f nginx/Dockerfile .
cd ../db
docker build -t waku-waku-db .
cd ../sfu
docker build -t waku-waku-sfu .

cd ../
docker-compose up -d
```

### Build and run for docker in EC2 with ECR

#### Clone (On your PC)

``` bash

git clone ...
cp auth/sample.env auth/.env_prd
cp sfu/sample.env sfu/.env_prd
cp client/nginx-aws/conf.d/proxy.sample_conf client/nginx-aws/conf.d/proxy.conf 
# Edit the two '.env' files and the proxy.conf according to your environment.

```

#### Configure AWS CLI (On your PC)

 - Configure AWS CLI to make it possible to push docker images to ECR repositories.

#### Create ECR repositories (On your PC)

``` bash

MY_ACCOUNT_ID=.... # Input your aws account id.
MY_REGION=.... # Input region to use

# Login
aws ecr get-login-password --region ${MY_REGION} | docker login --username AWS --password-stdin ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com

# Auth
aws ecr create-repository \
    --repository-name waku-waku-auth \
    --image-scanning-configuration scanOnPush=true \
    --region ${MY_REGION}

# client
aws ecr create-repository \
    --repository-name waku-waku-client \
    --image-scanning-configuration scanOnPush=true \
    --region ${MY_REGION}

# db
aws ecr create-repository \
    --repository-name waku-waku-db \
    --image-scanning-configuration scanOnPush=true \
    --region ${MY_REGION}

# sfu
aws ecr create-repository \
    --repository-name waku-waku-sfu \
    --image-scanning-configuration scanOnPush=true \
    --region ${MY_REGION}

```

#### Create log groups on Cloud Watch (On your PC)

``` bash

MY_REGION=.... # Input region to use

aws logs create-log-group --log-group-name waku-waku-log-group --region ${MY_REGION}

```

#### Build images (On your PC)

``` bash

MY_ACCOUNT_ID=.... # Input your aws account id.
MY_REGION=.... # Input region to use
MY_PLATFORM=.... # Input your target platform (e.g. linux/arm64, linux/amd64)

# Login
aws ecr get-login-password --region ${MY_REGION} | docker login --username AWS --password-stdin ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com

# on the project's root directory...

# auth
cd auth
docker buildx build --platform ${MY_PLATFORM} -t ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com/waku-waku-auth:latest --push .

# client
cd ../client
docker buildx build --platform ${MY_PLATFORM} -t ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com/waku-waku-client:latest -f nginx-aws/Dockerfile --push .

# db
cd ../db
docker buildx build --platform ${MY_PLATFORM} -t ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com/waku-waku-db:latest --push .

# sfu
cd ../sfu
docker buildx build --platform ${MY_PLATFORM} -t ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com/waku-waku-sfu:latest --push .

```


 - [Leverage multi-CPU architecture support - docker docs](https://docs.docker.com/desktop/multi-arch/)


#### Send environment files to EC2 instance (On your PC)

``` bash

MY_ACCOUNT_ID=.... # Input your aws account id.
MY_REGION=.... # Input region to use

# on the project's root directory...

chmod +x ./make-package.sh
./make-package.sh ${MY_ACCOUNT_ID} ${MY_REGION}
scp -i ...(path to your ssh key file) waku-waku-video-meeting.tar.gz your_user_name@your.instance.example.com:~/

```

#### Set up EC2 instance (On EC2 instance)

 - Install Docker and Docker compose.
 - Configure AWS CLI to make it possible to pull docker images from ECR repositories.
 - Get Let's Encrypt certificate for your domain.
 - Attach an IAM role to the EC2 instance so that it can access to Cloud Watch([see](https://stackoverflow.com/questions/42951444/aws-cloudwatch-logs-with-docker-container-nocredentialproviders-no-valid-prov)).


####  Run on EC2 instance (On EC2 instance)

``` bash

# After SSH login...

MY_ACCOUNT_ID=.... # Input your aws account id.
MY_REGION=.... # Input region to use

# You may have to use 'sudo' depending on your settings.

# You may have to specify '--profile' depending on your AWS CLI configuration.

# login to Docker registry
aws ecr get-login-password --region ${MY_REGION} --profile ecr | docker login --username AWS --password-stdin ${MY_ACCOUNT_ID}.dkr.ecr.${MY_REGION}.amazonaws.com

tar -xvzf waku-waku-video-meeting.tar.gz 
cd waku-waku-video-meeting/
# If the services are running, you have to stop them.
# docker compose down
docker compose pull # To use the latest images when the local repository already has old images.
docker compose up -d

# If you want to delete unused(old) images
# docker image prune -f

```

Also you can restart a single container like the following:

([How to restart a single container with docker-compose - stack overflow](https://stackoverflow.com/questions/31466428/how-to-restart-a-single-container-with-docker-compose))

``` bash

docker compose pull client && docker-compose up -d --no-deps client

```