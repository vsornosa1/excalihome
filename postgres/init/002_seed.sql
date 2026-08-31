-- Seed an anonymous user and a sample diagram for quick testing
INSERT INTO users (id, username, password_hash)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'anonymous',
  ''
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO diagrams (id, user_id, name, slug, data)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'Welcome diagram',
  'welcome-diagram-222222',
  '{
    "elements": [
      {
        "id": "rect1",
        "type": "rectangle",
        "x": 200,
        "y": 200,
        "width": 200,
        "height": 100,
        "strokeColor": "#000000",
        "backgroundColor": "transparent",
        "fillStyle": "hachure",
        "strokeWidth": 1,
        "roughness": 1,
        "opacity": 100,
        "seed": 1,
        "version": 1
      },
      {
        "id": "arrow1",
        "type": "arrow",
        "x": 420,
        "y": 250,
        "width": 120,
        "height": 0,
        "strokeColor": "#000000",
        "backgroundColor": "transparent",
        "fillStyle": "hachure",
        "strokeWidth": 1,
        "roughness": 1,
        "opacity": 100,
        "seed": 2,
        "version": 1
      },
      {
        "id": "text1",
        "type": "text",
        "x": 250,
        "y": 340,
        "width": 200,
        "height": 40,
        "text": "Welcome to Excalihome!",
        "fontSize": 20,
        "fontFamily": 1,
        "strokeColor": "#000000",
        "version": 1
      }
    ],
    "appState": {
      "viewBackgroundColor": "#ffffff",
      "theme": "light"
    }
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO versions (id, diagram_id, name, data)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'Initial version',
  (SELECT data FROM diagrams WHERE id = '22222222-2222-2222-2222-222222222222')
)
ON CONFLICT (id) DO NOTHING;
