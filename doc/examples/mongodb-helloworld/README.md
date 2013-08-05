This example demonstrates how to configure and run a mongodb instance.

To run the example simply execute the following from your shell:

	cd path/to/vortex/git/doc/examples/mongodb-helloworld
	npm install
	vortex boot
	vortex provision

Nothice that we use `npm install`. This ensures that all vortex/roost plugins are correctly installed. Mongodb itself is installed via the "roost-mongodb" plugin.
