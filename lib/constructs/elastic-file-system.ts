import { Construct } from "constructs";
import { Tags } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_efs as efs } from 'aws-cdk-lib';

export interface ElasticFileSystemProps {
  name: string,
  securityGroup: ec2.SecurityGroup,
  vpc: ec2.Vpc,
}

export default class ElasticFileSystem extends Construct {
  public readonly fileSystem: efs.FileSystem;

  constructor(scope: Construct, id: string, props: ElasticFileSystemProps) {
    super(scope, id);

    const { 
      name,
      securityGroup,
      vpc,
    } = props;


    this.fileSystem = new efs.FileSystem(this, 'SharedFileSystem', {
      vpc,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    });
    this.fileSystem.connections.allowDefaultPortFrom(securityGroup);

    Tags.of(this.fileSystem).add('appName', name);

  }
}