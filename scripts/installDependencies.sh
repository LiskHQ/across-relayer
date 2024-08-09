# Install nodejs dependencies
sudo apt update
echo "Current DIR: $PWD"
# Script to install Node.js using NVM on Ubuntu without sudo

node_version=v20
# Function to install NVM
install_nvm() {
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
}

# nvm command is a shell function declared in ~/.nvm/nvm.sh
nvm_path=~/.nvm/nvm.sh

install_node_version() {
    # Check if NVM is installed
    if command -v . $nvm_path &> /dev/null
    then
        echo "NVM is already installed."
    else
        echo "Installing NVM..."
        install_nvm
    fi

    node_command=`command -v node`
    current_node_version=`node -v |  awk -F\. '{print $1}'`
    # Check if correct version of node is present
    if [[ "$node_command" ]] && [[ "$node_version" == "$current_node_version" ]];
    then
        echo "Correct node version is already installed."
    else
        echo "Node version $node_version is not installed. Installing..."
        . $nvm_path nvm install $node_version
        . $nvm_path nvm use $node_version
    fi
}

install_node_version

echo "Node.js version $node_version has been installed."

sudo apt install npm
echo "***Installed npm***"
# Install yarn
sudo npm install --global yarn
echo "***Installed yarn***"
# Install pm2
sudo npm install --global pm2@latest
echo "***Installed pm2***"