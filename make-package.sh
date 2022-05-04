#!/bin/bash

MY_ACCOUNT_ID=$1;
MY_REGION=$2;
COMPOSE_FILE=$3;

if [ "${MY_ACCOUNT_ID}" = "" ];
then
	echo "MY_ACCOUNT_ID is empty."
	exit 1
fi

if [ "${MY_REGION}" = "" ];
then
	echo "MY_ACCOUNT_ID is empty."
	exit 1
fi

if [ "${COMPOSE_FILE}" = "" ];
then
	COMPOSE_FILE=docker-compose-aws.yml
fi

rm -rf waku-waku-video-meeting
rm -rf waku-waku-video-meeting.tar.gz
mkdir waku-waku-video-meeting
mkdir waku-waku-video-meeting/auth
mkdir waku-waku-video-meeting/sfu

cp ${COMPOSE_FILE} waku-waku-video-meeting/docker-compose.yml
REPEL_EXP_1=s/MY_ACCOUNT_ID/${MY_ACCOUNT_ID}/g
REPEL_EXP_2=s/MY_REGION/${MY_REGION}/g
gsed -i ${REPEL_EXP_1} waku-waku-video-meeting/docker-compose.yml
gsed -i ${REPEL_EXP_2} waku-waku-video-meeting/docker-compose.yml

cp auth/.env_prd waku-waku-video-meeting/auth/.env
cp sfu/.env_prd waku-waku-video-meeting/sfu/.env

tar -zcvf waku-waku-video-meeting.tar.gz waku-waku-video-meeting
rm -rf waku-waku-video-meeting
