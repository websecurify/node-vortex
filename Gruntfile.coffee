module.exports = (grunt) ->
	grunt.initConfig
		coffee:
			compile:
				files: [
					{expand: true, cwd: 'src/', src: '*.coffee', dest: 'lib/', ext: '.js', filter: 'isFile'}
				]
		watch:
			lib:
				files: ['lib/*']
				tasks: ['coffee:compile']
				
	grunt.loadNpmTasks 'grunt-contrib-watch'
	grunt.loadNpmTasks 'grunt-contrib-coffee'
	
	grunt.registerTask 'build', ['coffee:compile']
	grunt.registerTask 'default', ['build']
	
