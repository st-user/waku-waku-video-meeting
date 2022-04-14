use mobc::Pool;
use mobc_postgres::PgConnectionManager;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tokio_postgres::{Config, NoTls, Row};

use crate::errors::ApplicationError;

pub type DBPool = mobc::Pool<mobc_postgres::PgConnectionManager<tokio_postgres::NoTls>>;

#[derive(Deserialize, Serialize, Debug)]
pub struct RoomMember {
	pub member_id: i64,
	pub room_id: i64,
	pub room_name: String,
	pub member_name: String	
}

pub struct MemberToken {
	pub member_id: i64,
	pub secret_token: String
}

impl MemberToken {
	pub fn decode(token_str: &String) -> Result<MemberToken, ApplicationError> {
		let decoded_bytes = base64::decode_config(token_str, base64::URL_SAFE)?;
		let decoded_str = String::from_utf8(decoded_bytes)?;
		let tokens: Vec<&str> = decoded_str.split(":").collect();
		if tokens.len() != 2 {
			return Err(ApplicationError::Message("Invalid member token format.".to_owned()));
		}
		let member_id: i64 = match tokens.get(0).unwrap().to_owned().parse() {
			Ok(id) => id,
			Err(e) => return Err(ApplicationError::Message(format!("Invalid member token format {:?}.", e)))
		};

		let secret_token = String::from(*tokens.get(1).unwrap());

		Ok(MemberToken {
			member_id,
			secret_token
		})
	}
}

pub fn create_db_pool() -> DBPool {
	let db_url = std::env::var("DB_URL").expect("DB_URL must be specified.");
    
    let config = Config::from_str(&db_url).unwrap();
    let connection_manager = PgConnectionManager::new(config, NoTls);

    Pool::builder().max_open(20).build(connection_manager)
}

pub struct RoomMemberDao {
	db_pool: DBPool
}

impl RoomMemberDao {

	pub fn new(db_pool: DBPool) -> RoomMemberDao {
		RoomMemberDao {
			db_pool
		}
	}

	pub async fn find_room_member(&self, member_id: &i64, secret_token: &String) -> Result<RoomMember, ApplicationError> {
		let client = self.db_pool.get().await?;

		let sql = "
			SELECT
					m.member_id as member_id,
					m.room_id as room_id,
					r.room_name as room_name,
					m.member_name as member_name
				FROM
					myappsch.members m
						INNER JOIN
					myappsch.rooms r
						ON
					m.room_id = r.room_id
				WHERE
					m.member_id = $1
						AND
					m.secret_token = $2
		";

		let result = client
			.query_one(sql, &[member_id, secret_token])
			.await?;
		
		Ok(row_to_room_member(&result))
	}
}

fn row_to_room_member(row: &Row) -> RoomMember {
	RoomMember {
		member_id: row.get(0),
		room_id: row.get(1),
		room_name: row.get(2),
		member_name: row.get(3)
	}
}