-- Add medical ninja fields to users table
ALTER TABLE users
ADD COLUMN occupation VARCHAR(50) DEFAULT NULL,
ADD COLUMN medical_ninja_exp BIGINT DEFAULT 0;

-- Create medical ninja squads table
CREATE TABLE medical_ninja_squads (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    leader_id VARCHAR(255) NOT NULL,
    village_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (leader_id) REFERENCES users(id),
    FOREIGN KEY (village_id) REFERENCES villages(id)
);

-- Create medical ninja squad members table
CREATE TABLE medical_ninja_squad_members (
    squad_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (squad_id, user_id),
    FOREIGN KEY (squad_id) REFERENCES medical_ninja_squads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
