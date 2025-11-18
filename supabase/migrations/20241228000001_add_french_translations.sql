-- ============================================================================
-- ADD FRENCH TRANSLATIONS FOR DEFAULT QUESTIONS
-- ============================================================================
-- This migration adds French translations for the default trivia questions
-- that were inserted in the initial schema migration

-- Update default trivia questions with French translations
-- These correspond to the questions inserted in 20240101000000_initial_schema.sql

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'De quelle couleur est le costume du Père Noël ?',
    'answers', '["Rouge", "Bleu", "Vert", "Jaune"]'::jsonb
  )
)
WHERE question = 'What color is Santa''s suit?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Combien de rennes tirent le traîneau du Père Noël (y compris Rudolph) ?',
    'answers', '["8", "9", "10", "12"]'::jsonb
  )
)
WHERE question = 'How many reindeer pull Santa''s sleigh (including Rudolph)?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Que les enfants laissent-ils généralement pour le Père Noël la veille de Noël ?',
    'answers', '["Des biscuits et du lait", "De la pizza", "Des bonbons", "Des fruits"]'::jsonb
  )
)
WHERE question = 'What do children typically leave out for Santa on Christmas Eve?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Dans quel pays la tradition de mettre un sapin de Noël a-t-elle commencé ?',
    'answers', '["États-Unis", "Angleterre", "Allemagne", "France"]'::jsonb
  )
)
WHERE question = 'In which country did the tradition of putting up a Christmas tree originate?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Quel est le nom du chien du Grinch ?',
    'answers', '["Max", "Buddy", "Charlie", "Rex"]'::jsonb
  )
)
WHERE question = 'What is the name of the Grinch''s dog?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Quel chant de Noël contient les paroles "Dors en paix céleste" ?',
    'answers', '["Douce nuit", "Vive le vent", "Décorons la salle", "Joie au monde"]'::jsonb
  )
)
WHERE question = 'Which Christmas carol includes the lyric "Sleep in heavenly peace"?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Combien de cadeaux au total ont été donnés dans "Les Douze Jours de Noël" ?',
    'answers', '["78", "144", "364", "120"]'::jsonb
  )
)
WHERE question = 'How many gifts in total were given in "The Twelve Days of Christmas"?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Quel est le nom du célèbre ballet russe sur Noël ?',
    'answers', '["Casse-Noisette", "Le Lac des cygnes", "La Belle au bois dormant", "Cendrillon"]'::jsonb
  )
)
WHERE question = 'What is the name of the famous Russian ballet about Christmas?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Dans le film Elf, quelle est la première règle du "Code des Elfes" ?',
    'answers', '["Traiter chaque jour comme Noël", "Fabriquer des jouets", "Répandre la joie", "Être gentil"]'::jsonb
  )
)
WHERE question = 'In the movie Elf, what is the first rule of "The Code of Elves"?';

UPDATE trivia_questions
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'question', 'Quel pays a commencé la tradition d''échanger des cadeaux ?',
    'answers', '["Italie", "Allemagne", "États-Unis", "Pays-Bas"]'::jsonb
  )
)
WHERE question = 'Which country started the tradition of exchanging gifts?';

-- ============================================================================
-- ADD FRENCH TRANSLATIONS FOR DEFAULT PRICE ITEMS
-- ============================================================================

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'iPhone 15 Pro',
    'description', 'Dernier smartphone Apple'
  )
)
WHERE name = 'iPhone 15 Pro';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'PlayStation 5',
    'description', 'Console de jeu'
  )
)
WHERE name = 'PlayStation 5';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'AirPods Pro',
    'description', 'Écouteurs sans fil'
  )
)
WHERE name = 'AirPods Pro';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Pull de Noël',
    'description', 'Pull de fête moche'
  )
)
WHERE name = 'Christmas Sweater';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Kit Maison en Pain d''Épices',
    'description', 'Trait de vacances à faire soi-même'
  )
)
WHERE name = 'Gingerbread House Kit';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Set LEGO Star Wars',
    'description', 'Plus de 1000 pièces'
  )
)
WHERE name = 'LEGO Star Wars Set';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Instant Pot',
    'description', 'Cuiseur multi-usages'
  )
)
WHERE name = 'Instant Pot';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Couverture Ponderée',
    'description', 'Couverture douillette de 7 kg'
  )
)
WHERE name = 'Weighted Blanket';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Sonnette Ring',
    'description', 'Sécurité domotique'
  )
)
WHERE name = 'Ring Doorbell';

UPDATE price_items
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'name', 'Machine à Café Starbucks',
    'description', 'Cafetière programmable'
  )
)
WHERE name = 'Starbucks Coffee Maker';

-- ============================================================================
-- ADD FRENCH TRANSLATIONS FOR DEFAULT NAUGHTY PROMPTS
-- ============================================================================

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Quelqu''un qui parle pendant les films'
  )
)
WHERE prompt = 'Someone who talks during movies';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Les gens qui ne remettent pas les chariots de courses'
  )
)
WHERE prompt = 'People who don''t return shopping carts';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Les amis qui révèlent les intrigues des séries TV'
  )
)
WHERE prompt = 'Friends who spoil TV shows';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Quelqu''un qui mâche la bouche ouverte'
  )
)
WHERE prompt = 'Someone who chews with their mouth open';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Les gens qui n''utilisent pas les clignotants'
  )
)
WHERE prompt = 'People who don''t use turn signals';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Quelqu''un qui vole la nourriture du frigo du bureau'
  )
)
WHERE prompt = 'Someone who steals food from the office fridge';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Les gens qui laissent le siège des toilettes relevé'
  )
)
WHERE prompt = 'People who leave the toilet seat up';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Quelqu''un qui est toujours en retard'
  )
)
WHERE prompt = 'Someone who''s always late';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Les gens qui ne mettent pas leur téléphone en silencieux au cinéma'
  )
)
WHERE prompt = 'People who don''t silence their phone in movies';

UPDATE naughty_prompts
SET translations = jsonb_set(
  COALESCE(translations, '{}'::jsonb),
  '{fr}',
  jsonb_build_object(
    'prompt', 'Quelqu''un qui offre des cadeaux regiftés'
  )
)
WHERE prompt = 'Someone who regifts presents';

