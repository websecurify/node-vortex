# Node States

Each node can have the following states queried via the Provider.prototype.status function:

* **booting** - the node is currently booting and it is not available for interaction.
* **running** - the node is running and it is available for interaction.
* **halting** - the node is halting and will soon become unavailable for interaction.
* **stopped** - the node is stopped.