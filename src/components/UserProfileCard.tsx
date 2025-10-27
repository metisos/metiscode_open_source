import React from 'react';

interface UserProfileCardProps {
    name: string;
    bio: string;
    imageUrl: string;
    contactInfo: string;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({ name, bio, imageUrl, contactInfo }) => {
    return (
        <div className="user-profile-card">
            <img src={imageUrl} alt={`${name}'s profile`} />
            <h2>{name}</h2>
            <p>{bio}</p>
            <p>Contact: {contactInfo}</p>
        </div>
    );
};

export default UserProfileCard;
