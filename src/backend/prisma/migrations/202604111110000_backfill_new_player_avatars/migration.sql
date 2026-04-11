/**
 * Backfills avatar paths for players whose images were added after
 * some career saves had already been created.
 */
UPDATE "Player"
SET "avatar" = CASE lower("name")
  WHEN 'paranormal' THEN 'resources://avatars/Paranormal.png'
  WHEN 'cozen' THEN 'resources://avatars/Cozen.png'
  WHEN 'tikuak' THEN 'resources://avatars/tikuak.png'
  WHEN 'ruben' THEN 'resources://avatars/rubeN.png'
  WHEN 'rage' THEN 'resources://avatars/rage.png'
  WHEN 'expsasiki' THEN 'resources://avatars/expSasiKi.png'
  WHEN 'suki' THEN 'resources://avatars/suki.png'
  ELSE "avatar"
END
WHERE lower("name") IN ('paranormal', 'cozen', 'tikuak', 'ruben', 'rage', 'expsasiki', 'suki');
