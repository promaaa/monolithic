-- Add SIM card (ueid: 001010000059449)
-- NOTE: The configuration file and the database must be updated before starting the containers.

INSERT INTO `AuthenticationSubscription` (`ueid`, `authenticationMethod`, `encPermanentKey`, `protectionParameterId`, `sequenceNumber`, `authenticationManagementField`, `algorithmId`, `encOpcKey`, `encTopcKey`, `vectorGenerationInHss`, `n5gcAuthMethod`, `rgAuthenticationInd`, `supi`) VALUES
    ('001010000059449', '5G_AKA', '5686e601f3a1942d4c5cd262ba6b4b20', '5686e601f3a1942d4c5cd262ba6b4b20', '{"sqn": "000000000000", "sqnScheme": "NON_TIME_BASED", "lastIndexes": {"ausf": 0}}', '8000', 'milenage', 'aeb1cabd8ed7a09b48d17eb3d8af172c', NULL, NULL, NULL, NULL, '001010000059449');

-- To apply this, add the above SQL to ~/monolithic/oai-cn5g/database/oai_db.sql
-- before running `docker compose up -d` in the oai-cn5g directory.