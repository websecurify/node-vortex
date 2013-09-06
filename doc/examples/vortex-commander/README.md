This example demonstrates how to execute various types of commands in a virtualized container.

To run the example simply execute the following from your shell:

	cd path/to/vortex/git/doc/examples/vortex-commander
	vortex up

Once the environment is up you can use the following syntax to launch various commands inside the virtualized container:

	vortex shell -- -- command

For example

	vortex shell -- -- ls -la 					# lists the home directory
	vortex shell -- -- apt-get install nginx 	# install nginx

This syntax also works for multiple nodes in your own setups. For example if you have a vortex project with nodes `app`, `db`, `backup` and `logs` then you can update all of them by using the following command

	vortex shell -- -- apt-gate update

If you want to update just `app` and `db` but not `backup` and `logs` you do the following:

	vortex shell app db -- -- apt-get update
