#!/bin/bash
# PDF Studio starten op Linux: kleine lokale webserver, enkel bereikbaar op deze computer
cd "$(dirname "$0")"
PORT=47613
URL="http://localhost:$PORT/index.html"
echo ""; echo "  PDF Studio draait op $URL"; echo "  Laat dit venster open zolang u PDF Studio gebruikt."; echo ""
(sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
if command -v python3 >/dev/null 2>&1 && python3 -c "import http.server" >/dev/null 2>&1; then exec python3 -m http.server $PORT --bind 127.0.0.1
elif command -v ruby >/dev/null 2>&1; then exec ruby -run -e httpd . -p $PORT -b 127.0.0.1
else echo "Python 3 of Ruby is nodig. Gebruik anders de web-app (zie LEESMIJ)."; read -r -p "Druk op Enter om te sluiten"; fi
