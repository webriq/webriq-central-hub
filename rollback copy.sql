-- Task 478 batch 2: rollback of apply.sql (restores the values read by the dry run).
begin;

-- #02 Trident Roof Solutions Website (67CC38C5-PROJ-04)
update project_phases set status = 'planned', actual_start_date = null where id = '255bf904-fe0d-4cde-9d3d-b1aa597d44dc';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '7c1c9bd5-2106-4ebf-8f8c-44fcef257dd7';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'd6f8cbff-da3d-491a-ab89-3c5bbba8ca06';
update project_phases set status = 'active', actual_start_date = '2026-11-17', actual_completed_date = null where id = '41f2fa26-fc61-444a-97df-59594934ac0c';
update project_phases set status = 'bypassed', actual_completed_date = null where id = 'e85547c8-31e3-4d39-a6b3-8ce2c5f712ec';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '255bf904-fe0d-4cde-9d3d-b1aa597d44dc';

-- #06 Veteran Roofing & Exteriors (C74DEA31-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = 'eade4c47-d436-4d95-9adf-a38a3a606a36';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'a2e88daa-1b26-48f8-8282-efc5ebb96095';
update project_phases set status = 'active', actual_start_date = '2026-08-21', actual_completed_date = null where id = 'd61e04ec-268b-4337-9668-306b40cd4dd8';
update project_phases set status = 'bypassed', actual_start_date = null, actual_completed_date = null where id = 'db0036e0-49a9-4bfc-8634-764bc78f9448';
update project_phases set status = 'bypassed', actual_completed_date = null where id = '4e0653c8-b6d7-4537-b5d1-690957af99a5';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = 'eade4c47-d436-4d95-9adf-a38a3a606a36';

-- #01 Retail Sign Systems (DDF84B09-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = '655ebb3c-5de1-4a2d-bdf4-80529efd64d8';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '602ac68a-a345-4e13-996d-0c9e10739dc3';
update project_phases set status = 'active', actual_start_date = '2026-09-01', actual_completed_date = null where id = '9c68df74-eb6b-4d2f-9294-f0b768670369';
update project_phases set status = 'bypassed', actual_start_date = null, actual_completed_date = null where id = 'bac82877-ca27-4601-80be-40326aad03d5';
update project_phases set status = 'bypassed', actual_completed_date = null where id = 'cd6fde5b-fad6-4aef-9f83-f08990cb61c5';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '655ebb3c-5de1-4a2d-bdf4-80529efd64d8';

-- #08 Greydog Security (82ACEB0F-PROJ-03)
update project_phases set status = 'planned', actual_start_date = null where id = 'd9f94364-010a-4748-9f35-abe8caa4bfd8';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'f26af492-8a51-4336-9db2-f4a8dc9aae1b';
update project_phases set status = 'active', actual_start_date = '2026-08-21', actual_completed_date = null where id = 'ec6ccdf6-b508-4529-8cd5-504fb29d1998';
update project_phases set status = 'bypassed', actual_start_date = null, actual_completed_date = null where id = 'efd05af3-d6f7-4fc0-9777-210d0e308258';
update project_phases set status = 'bypassed', actual_completed_date = null where id = '0780c4d6-32b6-4df5-9dd3-723affb89a4d';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = 'd9f94364-010a-4748-9f35-abe8caa4bfd8';

-- #10 RCB & Associates LLC (5EBACF20-PROJ-01)
update project_phases set status = 'planned', actual_start_date = null where id = '4fe20152-43bd-4735-8e7e-f3ed09495b53';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'c786ab10-f7ed-4d1a-bfd9-6d4f1434d3e2';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '1fe0fe72-9188-406f-8108-f4ebf09d5cdb';
update project_phases set status = 'active', actual_start_date = '2026-08-05', actual_completed_date = null where id = '55f63585-8263-44dd-a719-208ba4793ba9';
update project_phases set status = 'bypassed', actual_completed_date = null where id = '702a5cd8-abf6-424b-8ca6-c2c02786371a';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '4fe20152-43bd-4735-8e7e-f3ed09495b53';

-- #12 M&I Interiors (D0A5D523-PROJ-04)
update project_phases set status = 'planned', actual_start_date = null where id = 'f1b03669-e8eb-4059-9a43-ea7a9a329575';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '8b2d1d0f-2d0c-4980-b0e5-6020ca39a217';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '1d1960da-42d9-451c-9cf7-e99d99bf7217';
update project_phases set status = 'active', actual_start_date = '2026-07-30', actual_completed_date = null where id = 'b07e1fea-c581-43b5-a91b-599107447fb7';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = 'f1b03669-e8eb-4059-9a43-ea7a9a329575';

commit;
