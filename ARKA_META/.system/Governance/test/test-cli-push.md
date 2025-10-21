# Créer session pour Archiviste et lancer codex dedans
tmux new-session -d -s arka-archiviste -c /mnt/c/Users/grimo/Documents/Projets/Arka-labs-d
tmux send-keys -t arka-archiviste "codex" C-m

echo "✓ Session arka-archiviste créée"
echo "✓ Codex en cours de démarrage..."
echo ""
echo "💡 Attendre 3-5s que Codex initialise..."

# Injecter le contenu de l'onboarding dans Codex
ONBOARDING_PATH=".openAi-provider/.codex-Archiviste/onboarding.md"

# Vérifier que le fichier existe
if [ -f "$ONBOARDING_PATH" ]; then
    echo "✓ Onboarding trouvé : $ONBOARDING_PATH"
    
    # Lire le fichier et l'envoyer à Codex
    # Note: tmux send-keys a des limites de taille, on va faire ligne par ligne
    cat "$ONBOARDING_PATH" | while IFS= read -r line; do
        tmux send-keys -t arka-archiviste "$line"
        tmux send-keys -t arka-archiviste C-m
    done
    
    echo "✓ Onboarding injecté"
else
    echo "❌ Fichier non trouvé : $ONBOARDING_PATH"
fi
sleep 0.1  # Petit délai entre lignes




# Au lieu d'injecter ligne par ligne, créer un prompt propre
ONBOARDING_PATH=".openAi-provider/.codex-Archiviste/onboarding.md"

# Créer un fichier prompt temporaire
cat > /tmp/archiviste-prompt.txt << EOF
# CONTEXTE AGENT ARKA

Voici ton rôle et contexte projet. Lis attentivement :

$(cat "$ONBOARDING_PATH")

---

Maintenant que tu as lu ton onboarding, réponds simplement :
"✓ Onboarding lu et compris. Je suis l'Archiviste, prêt."

Ensuite, tu devras lire tes messages dans : ARKA_META/messaging/agents/arka-agent01-arka-archivist-orchestrator/inbox.yaml
EOF

# Injecter le prompt complet via paste mode ou copier-coller simulé
tmux send-keys -t arka-archiviste "$(cat /tmp/archiviste-prompt.txt)" C-m

echo "✓ Onboarding + instruction envoyés à Codex"



---------------------------------------------------

#!/bin/bash

echo "🚀 Lancement Agent Archiviste..."

# 1. Spawn session + Codex
tmux new-session -d -s arka-archiviste -c "$(pwd)"
sleep 1
tmux send-keys -t arka-archiviste "codex" C-m
echo "✓ Codex démarré"

# 2. Attendre que Codex soit prêt
echo "⏳ Attente initialisation Codex (5s)..."
sleep 5

# 3. Envoyer instruction avec lien fichier
tmux send-keys -t arka-archiviste "Lis le fichier .openAi-provider/.codex-Archiviste/onboarding.md - Voici ton rôle et contexte projet. Lis tout et présente-moi ton rôle." C-m

echo "✓ Instruction envoyée"

# 4. Attendre que Codex lise et réponde
echo "⏳ Attente lecture et réponse (10s)..."
sleep 10

# 5. Demander de lire les messages
echo ""
echo "📨 Envoi instruction : lire les messages..."
tmux send-keys -t arka-archiviste "Maintenant lis tes messages dans ARKA_META/messaging/agents/arka-agent01-arka-archivist-orchestrator/inbox.yaml - Liste juste les messages que tu vois (IDs uniquement)." C-m

# 6. Attendre
sleep 10

# 7. Afficher résultat
echo ""
echo "📺 Sortie Codex :"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tmux capture-pane -t arka-archiviste -p -S -100
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Pour attacher interactivement : tmux attach -t arka-archiviste"

sleep 10