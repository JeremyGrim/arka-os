#!/usr/bin/env bash

# Script de test pour envoyer un message prédéfini vers la session Archiviste
set -euo pipefail

TARGET_PANE="${TARGET_PANE:-arka-archiviste}"
ROLE_MESSAGE="voici ton role et context projet lis tout les doc et presente moi ton role : .openAi-provider\\.codex-Archiviste\\onboarding.md"

send_lines() {
    local line
    for line in "$@"; do
        if [ -n "$line" ]; then
            tmux send-keys -t "$TARGET_PANE" "$line"
        fi
        tmux send-keys -t "$TARGET_PANE" Enter
        sleep 0.05
    done
}

case "${1:-}" in
    --message)
        echo "✓ Envoi du message prédéfini vers $TARGET_PANE"
        send_lines "$ROLE_MESSAGE" ""
        ;;
    ""|--message-only)
        echo "✓ Envoi du message prédéfini vers $TARGET_PANE"
        send_lines "$ROLE_MESSAGE" ""
        ;;
    *)
        echo "Usage :"
        echo "  $0              # envoie le message prédéfini"
        echo "  $0 --message    # envoie le message prédéfini"
        exit 2
        ;;
esac
