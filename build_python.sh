#!/bin/bash

venv="for-promotional-use-only-virtualenv"

echo "building virtualenv: $venv"

hash virtualenv
if [ "$?" != "0" ];
  then
    pip install virtualenv;
fi

virtualenv $venv

echo "installing for-promotional-use-only"
$venv/bin/pip install -e .


