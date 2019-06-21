#!/bin/bash

echo "Executing bash-script.sh with args:"
echo "$@"

# Print the command-line arguments with [] around each one
for a in $@ ; do
  echo -n "[$a] "
done
echo
