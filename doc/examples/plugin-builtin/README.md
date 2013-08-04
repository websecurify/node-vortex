This example demonstrates how you can add your own plugin in Vortex. The plugin simply provides some defaults in order to simplify the configuration file.

To run the example simply execute the following from your shell:

	cd path/to/vortex/git/doc/examples/plugin-builtin
	vortex boot
	vortex provision

You can extend this example into something much more complex which can do the following:

* Extract information from environment variables.
* Extract information from a centralised server.
* Automatically generate all nodes to be managed.
