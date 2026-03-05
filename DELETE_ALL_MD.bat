@echo off

echo Are you sure you want to delete ALL .md files in this folder?
echo This will delete EVERY markdown file including README.md and all guides.
pause

echo Deleting all .md files...
del /Q *.md

echo All .md files have been deleted! You can safely delete this script too.
pause
