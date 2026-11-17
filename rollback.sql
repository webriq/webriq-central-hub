-- Task 478: rollback of apply.sql (restores the values read by the dry run).
begin;

-- #03 Saginaw CFC (C30DE6A5-PROJ-03)
update project_phases set status = 'planned', actual_start_date = null where id = '77957126-0d9d-4c53-bfd0-ef6f11e246f7';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'b6d21627-4d4b-4126-8120-9541e7458641';
update project_phases set status = 'active', actual_start_date = '2026-09-09', actual_completed_date = null where id = '164d364d-898f-4291-8c43-46bdca48e222';
update project_phases set status = 'bypassed', actual_completed_date = null where id = '81041416-5a4d-4a2b-b1af-c0693aaad2cf';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '77957126-0d9d-4c53-bfd0-ef6f11e246f7';

-- #09 Studio Belmont (8978E416-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = '122ece12-9e21-403b-b83c-e87ff87fe6bf';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '636837bf-2ea2-48f0-a003-5d2363504467';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'cd7f05f7-c0fa-4853-bc76-f6915f98f175';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '6a468c7d-cbda-4dfc-b45a-ea81d39246ab';
update project_phases set status = 'active', actual_completed_date = null where id = '80cbe942-0fdd-49d1-b783-879e2987726f';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '122ece12-9e21-403b-b83c-e87ff87fe6bf';

-- #14 Hello Homes GR (D45CA759-PROJ-01)
update project_phases set status = 'planned', actual_start_date = null where id = '76a1c989-3fb5-4d84-8a25-8a602a6f7697';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '6b70128d-ea4b-4371-bc15-e6de5ba1d766';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'd42b8cfd-6b7f-4ecb-8270-0e7d6dd02896';
update project_phases set status = 'active', actual_start_date = '2026-08-21', actual_completed_date = null where id = '4b5587ab-03d9-440e-abb8-070b9488f7ed';
update project_phases set status = 'bypassed', actual_completed_date = null where id = '01a62ba0-723e-459a-8a8a-84bf61e9159b';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '76a1c989-3fb5-4d84-8a25-8a602a6f7697';

-- #13 Royal Thumper (FC6D83AB-PROJ-01)
update project_phases set status = 'planned', actual_start_date = null where id = '415ded7b-9c6d-4052-b67a-efd7415467cd';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'e2d8e773-545d-4b36-b278-45e6bddb0953';
update project_phases set status = 'active', actual_start_date = '2026-11-10', actual_completed_date = null where id = 'cfaae01a-2152-490b-95de-e6f3c049dbb6';
update project_phases set status = 'bypassed', actual_completed_date = null where id = 'a3b58570-5904-4d3b-8e42-f524affa5a69';
update project_phases set status = 'bypassed', actual_completed_date = null where id = '9a8250fa-c14d-4b95-a568-efcf3da49e5b';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '415ded7b-9c6d-4052-b67a-efd7415467cd';

-- #07 Black Barn Dumpsters (2CDA5C64-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = '8e64c4e8-e5ed-423f-964b-2f078219598e';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '0638502f-4097-4c5a-bdf9-d50bd23a8c7b';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '2147ddf6-5a12-4cc2-a786-8f1beb994dd0';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '4d2edc36-2369-45ee-bb36-aaf0852c44a5';
update project_phases set status = 'active', actual_completed_date = null where id = 'f9685ff8-c459-4263-925c-3ba2267ab0c9';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '8e64c4e8-e5ed-423f-964b-2f078219598e';

-- #05 WMI Home Solutions (09A80681-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = '506c2226-e4b5-4475-ab67-3adb43919326';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'a612a169-bd03-4026-a354-0fe9e5e8f5ef';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '038d2fb3-c496-40a8-bb5c-3baf4a12a8ac';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '79cbc29b-35a8-4f2e-998e-27eb5952b35a';
update project_phases set status = 'active', actual_completed_date = null where id = 'b8852049-4d08-4233-a0a2-1d30c899346e';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '506c2226-e4b5-4475-ab67-3adb43919326';

-- #18 Glorias Anzac Biscuits (3028EE9B-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = '86ad352f-2dc9-487e-aa24-b47f9c56f8c3';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'f6b43077-a240-448f-b008-7c667d065a50';
update project_phases set status = 'active', actual_completed_date = null where id = '4aa26e05-7f0e-4c96-b298-48e33fe30d9d';
update project_phases set status = 'bypassed', actual_completed_date = null where id = 'b5458db1-13d0-4745-aa77-5d6d78d859ab';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = '86ad352f-2dc9-487e-aa24-b47f9c56f8c3';

-- #15 AB Lekdetectie (82159826-PROJ-01)
update project_phases set status = 'planned', actual_start_date = null where id = 'b8a42c0b-c94b-4007-8336-079f20c5076a';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = 'e0254257-2eaf-4891-8d9d-79e48979d564';
update project_phases set status = 'active', actual_completed_date = null where id = '66da3166-07fc-4f28-9689-7fafaa4eeb69';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = 'b8a42c0b-c94b-4007-8336-079f20c5076a';

-- #16 Maxton (BD64C367-PROJ-02)
update project_phases set status = 'planned', actual_start_date = null where id = 'fa62d8a6-1615-4812-b017-4c417fcab254';
update project_phases set status = 'planned', actual_start_date = null, actual_completed_date = null where id = '587316b6-f0ac-45e0-bc24-d8e139f2edb8';
update project_phases set status = 'active', actual_completed_date = null where id = 'cdb0863b-13dc-4437-8a75-e7c8225196ef';
update phase_programme_state set is_manual_override = false, override_note = null where phase_id = 'fa62d8a6-1615-4812-b017-4c417fcab254';

commit;
