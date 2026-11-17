# CD Regal (Spicetify Custom App)

Das Regal zeigt gespeicherte Alben, Singles und Playlists als Cases und Kassetten.
Die Sammlung lässt sich alphabetisch nach Titel oder Künstler sowie nach Typ
sortieren. Alternativ bekommt jeder Künstler ein eigenes Regal. Beim Darüberfahren
werden Titel und Künstler eingeblendet; über die grüne Taste kann direkt
abgespielt werden.

Über das Zahnrad lassen sich Holzfarbe, Schrankbreite, Case-Höhe und -Abstand,
Schriftart, Künstleranzeige sowie eigene Case- und Schriftfarben einstellen.
Der Wiedergabe-Hub zeigt den aktuellen Spotify-Titel und steuert Spotifys
Wiedergabe. Auch außerhalb des Regals gestartete Titel werden übernommen; wenn
das Album im Regal liegt, wird dessen Case verwendet. Über das Warteschlangen-
Symbol im Hub öffnet sich Spotifys aktuelle Warteschlange. Die Liste kann nach
Titel oder Künstler sortiert und ein Titel direkt gestartet werden. Ein Titel
kann außerdem an den Anfang der Warteschlange verschoben oder aus ihr entfernt
werden. Die Sortierung ändert nur die Anzeige, nicht Spotifys Abspielreihenfolge.

Installation:
1. Ordner `cd-regal` nach CustomApps kopieren
   - Windows: %appdata%\spicetify\CustomApps\
   - macOS/Linux: ~/.config/spicetify/CustomApps/
2. spicetify config custom_apps cd-regal
3. spicetify apply
4. In Spotify links in der Seitenleiste auf das CD-Symbol klicken, oben rechts Vollbild.

Entfernen: spicetify config custom_apps cd-regal-  &&  spicetify apply
