	
	 _  _   __  ____  ____  ____  _  _ 
	/ )( \ /  \(  _ \(_  _)(  __)( \/ )
	\ \/ /(  O ))   /  )(   ) _)  )  ( 
	 \__/  \__/(__\_) (__) (____)(_/\_)
	 
	 by Websecurify
	 

# Introduction

Vortex is a virtual machine management tool. It is similar to [Vagrant](http://vagrantup.com/). The rationale for writing this tool is to enable better management of development and production infrastructure at the same time. We, [Websecurify](http://www.websecurify.com), could not easily achieve this with Vagrant so the this tool was written to fill the gap.

You can do the following things with Vortex:

1. Develop your application in a replicable dev environment.
2. Easily manage your application in the same configuration into a prod environment.

Vortex removes any barriers from the time you start developing your application to the time it is already live and you need to maintain it.

# Tool Philosophy

It is essential to understand the key principle behind Vortex, which is to **always produce a replicable environment**. This sounds nice and simple but it gets deeper than this.

What this means in practice is that virtual machines/nodes are disposable. In other words, they only exist fully provisioned and not in any other way. They also don't maintain any state. Once you halt a node, it is gone for good with all the data it was keeping within it. If you boot the node again it will launch a brand new instance. This is why there is no state.

State is essentially a 3rd-class citizen in Vortex. You provide it only by attaching external storages or by integrating with other services from your application. This sounds like a very extreme way of dealing with things but it does solve a few hard problems like scalability and the application effectiveness against hardware and other types of failure.

This philosophy is a constrain, which works in our favour and it is fully embraced in the design of the tool.

# Tool Installation

The easiest way to install Vortex is via node's npm. You need to have nodejs installed for this. Simply type the following command:

	npm install -g vortex

An alternative approach is to just copy the source files and execute them manually though nodejs. There are plans to create a standalone binary distributions if there is need for this.

# Tool Usage

You can use Vortex as a library or via the command line, which is more convenient. At the moment there are no docs on the API but for now you can just check the source code for inspiration.

Here are a few examples of how to use Vortex via your shell:

	vortex status 		# shows the status of all nodes
	vortex boot 		# boots all nodes
	vortex halt 		# halts all nodes
	vortex provision 	# provision all nodes

You can also specify which node you want to manipulate:

	vortex shell my-node-name 	# starts interactive session on the selected node
	vortex halt my-node-name 	# halts the selected node

By the default Vortex reads the configuration from `vortex.json` located inside the current working directory. However, you can specify an alternative location with the `-f|--file` option. For example:

	vortex -f path/to/folder 		# loads path/to/folder/vortex.json manifest
	vortex -f path/to/config.json 	# loads path/to/config.json manifest

Verbose messages can be obtained by using the `-v|--verbose` flag, which can also be combined with the `-c|--colorize` flag for better visual aid. For example:

	vortex -vv 		# enables debug level logging
	vortex -vvv -c 	# enables silly level logging with colorization

Vortex supports different providers to manage your virtual machines/nodes. Out of the box you have support for VirtualBox and Amazon. VirtualBox is the default provider. Here is an example how to select a different provider:

	vortex --provider=Amazon boot 	# boots nodes into amazon ec2

The default provisioner, Roost, can also be configured with some command-line options. If you specify the `-d|--dry` flag the provisioner will only output information on what it will do but not perform any actions. This is useful if you are uncertain about the changes you are making to the roost manifests and you just want to check it out before doing it for real. For example:

	vortex --provider=Amazon -d provision my-sensitive-node 	# dry-runs the provisioner

# Vortex Manifest

The Vortex manifest file is a simple JSON document. By default you are only required to specify the nodes you want in your configuration:

	{
		...
		
		"nodes": {
			"my-node": {
			}
		},
		
		...
	}

This is the simplest possible configuration, which is not useful for anything just yet. To make this configuration useful for booting an image in Amazon you need to supply additional information. This is how it is done:

	{
		...
		
		"amazon": {
			"accessKeyId": "YOUR ACCESS KEY GOES HERE",
			"secretAccessKey": "YOUR SECRET KEY GOES HERE",
			"region": "A REGION SUCH AS us-west-1, us-west-2, etc GOES HERE"
		},
		
		"nodes": {
			"ubuntu": {
				"amazon": {
					"imageId": "ami-2fb3201f",
					"securityGroups": ["default"],
					"keyName": "my-key",
					"privateKey": "path/to/my-key.pem",
					"username": "ubuntu"
				}
			}
		},
		
		...
	}

Providing credentials inside configuration file is not always optimal but it saves you from typing longer and more complex commands. The reality of the situation is that you can do the following:

	ACCESS_KEY_ID=bish SECRET_ACCESS_KEY=bosh AWS_REGION=us-west-1 vortex --provider=Amazon boot

The config file for this will be:

	{
		...
		
		"nodes": {
			"ubuntu": {
				"amazon": {
					"imageId": "ami-2fb3201f",
					"securityGroups": ["default"],
					"keyName": "my-key",
					"privateKey": "path/to/my-key.pem",
					"username": "ubuntu"
				}
			}
		},
		
		...	
	}

The same properties can also be provided per-node if this is what you want. Underneath all of this sits the [aws-sdk](http://aws.amazon.com/sdkfornodejs/) for nodejs so all parameters are exactly the same as you will find in the SDK.

VirtualBox is configured in the same way. The only difference is that you need to specify VirtualBox specific configuration. For example:

	{
		...
		
		"nodes": {
			"ubuntu": {
				"amazon": {
					"imageId": "ami-2fb3201f",
					"securityGroups": ["default"],
					"keyName": "my-key",
					"privateKey": "path/to/my-key.pem",
					"username": "ubuntu"
				},
				
				"virtualbox": {
					"username": "ubuntu",
					"password": "ubuntu",
					"vmId": "baseimage",
					"vmUrl": "http://path/to/baseimage.ova"
				}
			}
		},
		
		...	
	}

If you have a lot of nodes that are similar with minor differences you can move the configuration out of the node structure and specify it globally like such:

	{
		...
		
		"amazon": {
			"imageId": "ami-2fb3201f",
			"securityGroups": ["default"],
			"keyName": "my-key",
			"privateKey": "path/to/my-key.pem",
			"username": "ubuntu"
		},
		
		"virtualbox": {
			"username": "ubuntu",
			"password": "ubuntu",
			"vmId": "baseimage",
			"vmUrl": "http://path/to/baseimage.ova"
		},
		
		...
		
		"nodes": {
			"node1": {
				"amazon": {
					"username": "node1"
				}
			},
			"node2": {
				"amazon": {
					"username": "node2"
				}
			}	
		},
		
		...	
	}

Last but not least, nodes can be launched in their own namespaces. Namespaces are useful when there are a lot of stuff going on and you just want to logically separate nodes into different groups (or soft-groups if you prefer). Here is an example:

	{
		...
		
		namespace: "my-config",
		
		...
	
		"amazon": {
			"imageId": "ami-2fb3201f",
			"securityGroups": ["default"],
			"keyName": "my-key",
			"privateKey": "path/to/my-key.pem",
			"username": "ubuntu"
		},
	
		"virtualbox": {
			"username": "ubuntu",
			"password": "ubuntu",
			"vmId": "baseimage",
			"vmUrl": "http://path/to/baseimage.ova"
		},
	
		...
	
		"nodes": {
			"node1": {
				"amazon": {
					"username": "node1"
				}
			},
			"node2": {
				"amazon": {
					"username": "node2"
				}
			}	
		},
	
		...	
	}

Now `node1` and `node2` will run in the namespace `my-config` and this will not interfere with other nodes that have similar names. Namespaces can be used per node as well so you can get very creative.

# VirtualBox Options

The VirtualBox provider can be configured by supplying a "virtualbox" property at the top level of the manifest file or per-node. The following options are accepted everywhere:

* **vmId** - (string) the id or name of the virtual machine to be used as a base image
* **vmUrl** - (string) if the vmId is not found the image will be downloaded from a url
* **username** - (string) username for ssh (defaults to vortex)
* **password** - (string) password for ssh
* **privateKey** - (string) path to public ssh key
* **passphrase** - (string) passphrase for key

# Amazon Options

The Amazon provider can be configured by supplying a "amazon" property at the top level of the manifest file or per-node. The following options are accepted everywhere:

* **accessKeyId** - (string) your amazon access key id
* **secretAccessKey** - (string) your amazon access key
* **region** - (string) the region where you want to deploy
* **imageId** - (string) the image id to use
* **securityGroups** - (array of strings) security groups to apply 
* **keyName** - (string) keyname to use
* **disableApiTermination** - (string) make the instance un-terminatable
* **username** - (string) username for ssh (defaults to vortex)
* **password** - (string) password for ssh
* **privateKey** - (string) path to public ssh key
* **passphrase** - (string) passphrase for key

# Node Provisioning

Vortex comes with a built-in provisioner called [roost](https://github.com/websecurify/node-roost/) - another project of ours. Roost manifest files can be either imported from an external file or embedded directly into your vortex manifest. Here is an example:

	{
		...
		
		"nodes": {
			"ubuntu": {
				"roost": "roost.json"
			}
		},
		
		...
	}

You can also do the following if this is too much of trouble:

	{
		...
		
		"nodes": {
			"ubuntu": {
				"roost": {
					"apt": {
						"update": true
					},
					
					"packages": [
						"nodejs"
					],
					
					"commands": [
						"uname -a"
					]
				}
			}
		},
		
		...
	}

As a matter of fact, you can even apply a global roost file for all nodes. Just register the roost configuration outside of the "nodes" property.

Merging roost manifests is also possible when declared at multiple levels. For example, at top level you may want to apply some defaults and maybe even some updates. Per node you may want to apply generic configurations and have some additional provisioning options for each provider. Such complex setup is possible and here is an example:

	{
		...
		
		"roost": {
			"apt": {
				"update": true
			}
		}
		
		...
		
		"nodes": {
			"ubuntu": {
				"roost": {
					"merge": true,
					
					"packages": [
						"nodejs"
					]
				},
				
				"virtualbox": {
					"roost": {
						"merge": true,
						
						"commands": [
							"cd /media/cdrom; ./VBoxLinuxAdditions-x86.run"
						]
					}
				}
			}
		},
		
		...
	}

The manifest is built from the inner most configuration and merged upwards if the "merge" flag is set to `true`. This is a non-standard roost option.

For more information how the provisioner works just check the [project page](https://github.com/websecurify/node-roost/).

# Vortex Plugins

Vortex can be extended with plugins. Plugins are essentially nodejs modules and are installed the same way you typically install nodejs modules, i.e. npm and `package.json`. A good starting doc how npm modules work can be found [here](https://npmjs.org/doc/install.html).

In order to load a plugin you need to declare it in your Vortex manifest file. Here is an example:

	{
		...
		
		"plugins": [
			"my-plugin"
		],
		
		...
	}

Plugins are executed first and can affect everything from the actual manifest that was loaded to what providers and actions are exposed and much more.

The following workflow takes place when working with plugins.

1. Each plugin is loaded via node's `require`.
2. The module is inspected for two functions `getVortex` (takes priority) and `vortex`.
  * `getVortex` is used to retrieve an object that exposes a `vortex` function.
  * `vortex` is looked for to check if the plugin is compatible at this stage.
3. Before execution the plugin is invoked via a call to `vortex` function. The following parameters are passed:
  * opt - command line options
  * manifest - the manifest file
  * provider - default provider
  * action - the action to be executed

Use `getVortex` to augment the Vortex environment such as install new actions, providers, etc. Use `vortex` to do something, mostly with the manifest file, before the actual action takes place.

Vortex plugins can do pretty much everything so here are some suggestions of what you could do if you spend some time writing a plugin:

* A plugin, which fetches access credentials such as keys, usernames and password from a centralized storage.
* A plugin, which adds another provisioner such as chef and puppet.
* A plugin, which allows you extensive use of environment variables to configure all aspects of the manifest file.
* A plugin, which double-checks all options before launching an action in order to prevent unexpected behaviour.

The list goes on and on. Get creative!

# Node States

Each node can have the following states when querying via the Provider.prototype.status function:

* **booting** - the node is currently booting and it is not available for interaction.
* **running** - the node is running and it is available for interaction.
* **halting** - the node is halting and will soon become unavailable for interaction.
* **stopped** - the node is stopped.

These states are also exposed when quering a node via the status action, i.e.

	vortex status # shows a state such as booting, running, halting, stopped